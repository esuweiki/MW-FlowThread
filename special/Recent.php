<?php
namespace FlowThread;

class SpecialRecent extends \UnlistedSpecialPage {

	private $page;
	private $user;
	private $keyword;
	private $ip;
	private $filter;
	private $error;
	private $offset = 0;
	private $revDir;
	private $limit = 20;
	private $haveMore = false;

	public function __construct() {
		parent::__construct('FlowThreadRecent');
	}

	public function execute($par) {
		// Parse request
		$opt = new \FormOptions;
		$opt->add('user', '');
		$opt->add('page', '');
		$opt->add('filter', 'all');
		$opt->add('keyword', '');
		$opt->add('offset', '0');
		$opt->add('limit', '20');
		$opt->add('ip', '');
		$opt->add('dir', '');

		$opt->fetchValuesFromRequest($this->getRequest());

		// Reset filter to all if it cannot be recognized
		$this->filter = 'normal';

		// Set local variable
		$this->offset = 0;
		$this->limit = intval($opt->getValue('limit'));
		$this->revDir = false;

		// Limit the max limit
		if ($this->limit >= 500) {
			$this->limit = 500;
		}

		global $wgScript;

		$this->setHeaders();
		$this->outputHeader();
		$output = $this->getOutput();
		$output->addModules('ext.flowthread.manage');

		$json = array();
		$res = $this->queryDatabase();

		$count = 0;
		foreach ($res as $row) {
			if ($count === $this->limit) {
				$this->haveMore = true;
				break;
			} else {
				$count++;
			}
			$post = Post::newFromDatabaseRow($row);
			$title = \Title::newFromId($row->flowthread_pageid);
			$json[] = array(
				'id' => $post->id->getHex(),
				'userid' => $post->userid,
				'username' => $post->username,
				'pageid' => $post->pageid,
				'title' => $title ? $title->getPrefixedText() : null,
				'text' => $post->text,
				'timestamp' => $post->id->getTimestamp(),
				'parentid' => $post->parentid ? $post->parentid->getHex() : '',
				'like' => $post->getFavorCount(),
				'report' => $post->getReportCount(),
				'status' => $post->status,
			);
		}

		// Pager can only be generated after query
		$output->addHTML($this->getPager());
		$output->addHTML('<p>' . $this->msg('flowthreadrecent-refresh')->escaped() . '</p>');

		$output->addJsConfigVars(array(
			'commentfilter' => $this->filter,
			'commentjson' => $json,
		));
		if ($this->getUser()->isAllowed('commentadmin')) {
			$output->addJsConfigVars(array(
				'commentadmin' => '',
			));
		}

		global $wgFlowThreadConfig;

		if (\FlowThread\Post::canPost($output->getUser())) {
			$output->addJsConfigVars(array('canpost' => ''));
		}

		$output->addJsConfigVars(array('wgFlowThreadConfig' => array(
			'Avatar' => $wgFlowThreadConfig['Avatar'],
			'AnonymousAvatar' => $wgFlowThreadConfig['AnonymousAvatar'],
		)));
	}

	private function queryDatabase() {
		$dbr = wfGetDB(DB_SLAVE);
		$cond = array();

		$dir = $this->revDir ? 'ASC' : 'DESC';
		$orderBy = 'flowthread_id ' . $dir;

		$cond['flowthread_status'] = Post::STATUS_NORMAL;

		$res = $dbr->select(array(
			'FlowThread',
		), Post::getRequiredColumns(), $cond, __METHOD__, array(
			'ORDER BY' => $orderBy,
			'OFFSET' => $this->offset,
			'LIMIT' => $this->limit + 1,
		));

		return $res;
	}

	private function getQuery() {
		$query = $this->getRequest()->getQueryValues();
		unset($query['title']);
		return $query;
	}

	private function getPager() {
		return $this->msg('flowthreadrecent-show')->rawParams($this->getLimitLinks())->escaped();
	}

	private function getLimitLinks() {
		$possibleLimits = array(10, 20, 50, 100, 200);
		$query = $this->getQuery();
		$str = '';
		foreach ($possibleLimits as $limit) {
			if (strlen($str) !== 0) {
				$str .= $this->msg('pipe-separator')->escaped();
			}
			if ($limit === $this->limit) {
				$str .= $limit;
			} else {
				$query['limit'] = $limit;
				$str .= $this->getQueryLink($limit, $query);
			}
		}
		return $str;
	}

	private function getQueryLink($msg, $query) {
		return \Linker::linkKnown(
			$this->getTitle(),
			$msg,
			array(),
			$query
		);
	}

}
